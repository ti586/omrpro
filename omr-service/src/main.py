"""
main.py — OMR·Pro Microservice (FastAPI)
Exposes HTTP endpoints consumed by the Node.js API.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import os, uuid, shutil, redis.asyncio as aioredis, json, logging

from processors.omr_processor import OMRProcessor, OMRGrader
from processors.layout_builder import LayoutBuilder

logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
logger = logging.getLogger(__name__)

app = FastAPI(title='OMR·Pro Service', version='1.0.0')
processor = OMRProcessor()
grader    = OMRGrader()

UPLOAD_DIR = os.getenv('UPLOAD_DIR', '/app/uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

redis_client: aioredis.Redis = None

@app.on_event('startup')
async def startup():
    global redis_client
    redis_client = await aioredis.from_url(
        os.getenv('REDIS_URL', 'redis://localhost:6379'),
        decode_responses=True,
    )
    logger.info('OMR Service started')

@app.get('/health')
async def health():
    return {'status': 'ok', 'service': 'omr-service', 'version': '1.0.0'}


# ── POST /process — full OMR pipeline on single image ─────────
class ProcessRequest(BaseModel):
    card_id:    str
    exam_id:    str
    layout:     dict       # exam bubble layout
    answer_key: dict       # {q_num: {correct_answer, score, is_nullified}}
    total_score: float = 10.0

@app.post('/process')
async def process_card(
    request:    ProcessRequest,
    background: BackgroundTasks,
    image:      UploadFile = File(...),
):
    # Save uploaded image
    ext       = os.path.splitext(image.filename or '')[1] or '.jpg'
    img_path  = os.path.join(UPLOAD_DIR, f'{uuid.uuid4()}{ext}')

    with open(img_path, 'wb') as f:
        shutil.copyfileobj(image.file, f)

    # Run OMR synchronously (use queue for batch)
    omr_result = processor.process(img_path, request.layout)

    if not omr_result.success:
        # Publish error to Redis for Node.js to pick up
        await _publish_result(request.card_id, {
            'card_id': request.card_id,
            'success': False,
            'error':   omr_result.error,
        })
        raise HTTPException(status_code=422, detail=omr_result.error)

    # Grade
    grade = grader.grade(omr_result, request.answer_key, request.total_score)

    result = {
        'card_id':             request.card_id,
        'success':             True,
        'qr_data':             omr_result.qr_data,
        'exam_id_from_qr':     omr_result.exam_id,
        'student_id_from_qr':  omr_result.student_id,
        'rotation_angle':      omr_result.rotation_angle,
        'perspective_corners': omr_result.perspective_corners,
        'warnings':            omr_result.warnings,
        **grade,
        'question_results':    grade['question_results'],
    }

    # Publish to Redis channel so Node.js WebSocket can emit progress
    await _publish_result(request.card_id, result)

    # Cleanup temp file in background
    background.add_task(os.unlink, img_path)

    return result


# ── POST /process-batch — batch job trigger ───────────────────
class BatchJob(BaseModel):
    job_id:     str
    exam_id:    str
    card_ids:   list[str]
    layout:     dict
    answer_key: dict
    total_score: float = 10.0

@app.post('/process-batch')
async def process_batch(job: BatchJob, background: BackgroundTasks):
    """
    Enqueues a batch. Images are expected to have been uploaded
    already; card_ids map to filenames stored in UPLOAD_DIR.
    """
    background.add_task(_run_batch, job)
    return {'job_id': job.job_id, 'queued': len(job.card_ids)}

async def _run_batch(job: BatchJob):
    for card_id in job.card_ids:
        img_path = os.path.join(UPLOAD_DIR, f'{card_id}.jpg')
        if not os.path.exists(img_path):
            await _publish_result(card_id, {'card_id': card_id, 'success': False,
                                            'error': 'Arquivo não encontrado'})
            continue

        omr_result = processor.process(img_path, job.layout)
        if not omr_result.success:
            await _publish_result(card_id, {'card_id': card_id, 'success': False,
                                            'error': omr_result.error})
            continue

        grade = grader.grade(omr_result, job.answer_key, job.total_score)
        await _publish_result(card_id, {'card_id': card_id, 'success': True, **grade})

    # Signal batch complete
    await redis_client.publish(f'job:{job.job_id}:done', json.dumps({
        'job_id': job.job_id, 'total': len(job.card_ids),
    }))


# ── GET /layout — generate bubble layout from exam config ─────
@app.get('/layout/{exam_id}')
async def get_layout(exam_id: str, questions: str):
    """
    questions = JSON array of {number, type}
    Returns the computed pixel layout for OMR scanning.
    """
    try:
        q_list = json.loads(questions)
        builder = LayoutBuilder()
        layout  = builder.build(q_list)
        return layout
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ── Helpers ───────────────────────────────────────────────────
async def _publish_result(card_id: str, data: dict):
    try:
        await redis_client.publish(f'omr:card:{card_id}', json.dumps(data))
        # Also store last result for polling
        await redis_client.setex(f'omr:result:{card_id}', 3600, json.dumps(data))
    except Exception as exc:
        logger.error('Redis publish failed: %s', exc)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=int(os.getenv('PORT', 5001)),
                reload=os.getenv('NODE_ENV') != 'production')
