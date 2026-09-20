import os

import gradio as gr
import spaces
import spaces.zero
import uvicorn

if __package__:
    from .main import app as api_app
else:
    # Hugging Face receives the contents of backend/ as the Space repository root.
    from main import app as api_app


@spaces.GPU
def predict_gpu(text: str):
    """Small Gradio action used by the ZeroGPU runtime health UI."""
    return f"QuantumShield ZeroGPU Online: {text}"


demo = gr.Interface(
    fn=predict_gpu,
    inputs=gr.Textbox(label="Status Input", value="Check"),
    outputs=gr.Textbox(label="Status Output"),
    title="QuantumShield FinEdu API Server",
    description="Backend for CV-QKD / FSO simulation.",
)

# Reuse the production FastAPI application so its CORS middleware, validation,
# OpenAPI schema and native /v1, /api and compatibility routes remain intact.
# The native routes were registered before this root mount and therefore take
# precedence over the Gradio catch-all route.
app = gr.mount_gradio_app(api_app, demo, path="/")


def report_zero_gpu_startup() -> None:
    """Report decorated GPU functions when Gradio is mounted under Uvicorn.

    ZeroGPU normally performs this report from a monkey-patched
    ``Blocks.launch``. This Space uses ``mount_gradio_app`` and Uvicorn, so the
    report must be triggered explicitly before the server blocks.
    """
    startup = getattr(spaces.zero, "startup", None)
    if callable(startup):
        startup()


if __name__ == "__main__":
    report_zero_gpu_startup()
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "7860")),
    )
