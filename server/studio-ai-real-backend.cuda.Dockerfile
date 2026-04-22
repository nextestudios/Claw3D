FROM nvidia/cuda:12.8.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  cmake \
  curl \
  git \
  libegl1 \
  libgl1 \
  libglib2.0-0 \
  libgles2 \
  libglvnd0 \
  libglx0 \
  libopengl0 \
  libsm6 \
  libxext6 \
  libxrender1 \
  ninja-build \
  pkg-config \
  python3 \
  python3-dev \
  python3-pip \
  python3-venv \
  unzip \
  wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN useradd --create-home --shell /bin/bash appuser

COPY server/studio-ai-real-backend.requirements.txt /app/server/studio-ai-real-backend.requirements.txt
RUN python3 -m pip install --upgrade pip setuptools wheel && \
  python3 -m pip install --no-cache-dir \
    --pre torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/nightly/cu128 && \
  python3 -m pip install --no-cache-dir --force-reinstall "numpy<2" && \
  python3 -m pip install --no-cache-dir --no-build-isolation basicsr==1.4.2 && \
  python3 -m pip install --no-cache-dir -r /app/server/studio-ai-real-backend.requirements.txt

RUN python3 -m pip install --no-cache-dir fast-simplification

RUN git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git /opt/hunyuan/Hunyuan3D-2.1 && \
  export CUDA_HOME=/usr/local/cuda && \
  export CUDA_NVCC_FLAGS="-allow-unsupported-compiler" && \
  export TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9;9.0;12.0" && \
  python3 -m pip install --no-cache-dir --no-build-isolation /opt/hunyuan/Hunyuan3D-2.1/hy3dpaint/custom_rasterizer && \
  ln -sf /usr/bin/python3 /usr/local/bin/python && \
  cd /opt/hunyuan/Hunyuan3D-2.1/hy3dpaint/DifferentiableRenderer && \
  bash compile_mesh_painter.sh && \
  mkdir -p /opt/hunyuan/Hunyuan3D-2.1/hy3dpaint/ckpt && \
  wget -q https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth \
    -O /opt/hunyuan/Hunyuan3D-2.1/hy3dpaint/ckpt/RealESRGAN_x4plus.pth

COPY server/studio_ai_real_backend.py /app/server/studio_ai_real_backend.py
COPY server/studio-ai-real-backend.cuda.entrypoint.sh /usr/local/bin/studio-ai-real-backend-start
RUN chmod +x /usr/local/bin/studio-ai-real-backend-start && \
  mkdir -p /opt/hunyuan && \
  chown -R appuser:appuser /app /opt/hunyuan

ENV CLAW3D_STUDIO_LOCAL_UPSTREAM_HOST=0.0.0.0
ENV CLAW3D_STUDIO_LOCAL_UPSTREAM_PORT=8000
ENV CLAW3D_STUDIO_REAL_BACKEND_DEVICE=auto
ENV CLAW3D_STUDIO_REAL_BACKEND_HUNYUAN21_SOURCE_ROOT=/opt/hunyuan/Hunyuan3D-2.1
ENV PIP_NO_BUILD_ISOLATION=1
ENV TORCH_CUDA_ARCH_LIST="8.0;8.6;8.9;9.0;12.0"
ENV PYOPENGL_PLATFORM=egl

EXPOSE 8000

USER appuser
ENTRYPOINT ["/usr/local/bin/studio-ai-real-backend-start"]
