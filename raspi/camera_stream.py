#!/usr/bin/env python3
"""
Lightweight MJPEG camera streamer for the SO-ARM101 Raspberry Pi setup.

Supports two modes:
  1. --pipe  : Reads MJPEG frames from stdin (piped from rpicam-vid)
  2. --opencv: Uses OpenCV VideoCapture (for USB webcams)

Usage with Pi Camera Module (Bookworm):
  rpicam-vid -t 0 --width 640 --height 480 --framerate 15 --codec mjpeg --inline -o - | \\
    python3 camera_stream.py --pipe --port 8555

Usage with USB webcam:
  python3 camera_stream.py --opencv --device 8 --port 8554

Stream URL:   http://<PI_IP>:<PORT>/
Health check: http://<PI_IP>:<PORT>/health
"""

import sys
import argparse
import http.server
import socketserver
import threading
import time

DEFAULT_PORT = 8554

# Global frame buffer (shared between reader thread and HTTP handlers)
_frame_lock = threading.Lock()
_latest_frame = b""


def update_frame(jpg_bytes: bytes):
    global _latest_frame
    with _frame_lock:
        _latest_frame = jpg_bytes


def get_frame() -> bytes:
    with _frame_lock:
        return _latest_frame


# ─── Pipe reader (for rpicam-vid MJPEG output) ─────────────────────────────

def pipe_reader():
    """Read MJPEG frames from stdin (piped from rpicam-vid --codec mjpeg --inline)."""
    buf = b""
    while True:
        chunk = sys.stdin.buffer.read(4096)
        if not chunk:
            break
        buf += chunk
        # MJPEG frames start with 0xFFD8 and end with 0xFFD9
        while True:
            start = buf.find(b"\xff\xd8")
            if start == -1:
                buf = b""
                break
            end = buf.find(b"\xff\xd9", start + 2)
            if end == -1:
                buf = buf[start:]
                break
            frame = buf[start : end + 2]
            update_frame(frame)
            buf = buf[end + 2 :]


# ─── OpenCV reader (for USB webcams) ────────────────────────────────────────

def opencv_reader(device_index: int = 0):
    """Read frames from OpenCV VideoCapture and push them to the shared frame buffer."""
    import cv2
    print(f"📷 Opening /dev/video{device_index} ...")

    cap = cv2.VideoCapture(device_index)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 15)

    while True:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.01)
            continue
        _, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        update_frame(jpg.tobytes())


# ─── HTTP Server ────────────────────────────────────────────────────────────

class MJPEGHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"ok")
            return

        self.send_response(200)
        self.send_header(
            "Content-Type", "multipart/x-mixed-replace; boundary=frame"
        )
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()

        last_frame = b""
        try:
            while True:
                frame = get_frame()
                if frame and frame != last_frame:
                    self.wfile.write(b"--frame\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n\r\n")
                    self.wfile.write(frame)
                    self.wfile.write(b"\r\n")
                    last_frame = frame
                time.sleep(0.05)  # ~20fps max serve rate
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MJPEG camera streamer")
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"TCP port to serve the MJPEG stream on. Default: {DEFAULT_PORT}",
    )
    parser.add_argument(
        "--device",
        type=int,
        default=0,
        help="Video device index for OpenCV mode (e.g. 8 for /dev/video8). Default: 0",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--pipe",
        action="store_true",
        help="Read MJPEG frames from stdin (pipe from rpicam-vid)",
    )
    group.add_argument(
        "--opencv",
        action="store_true",
        help="Use OpenCV VideoCapture (USB webcam)",
    )
    args = parser.parse_args()

    # Default to pipe mode if neither specified
    if not args.pipe and not args.opencv:
        args.pipe = True

    port = args.port

    if args.pipe:
        print(f"📷 Pipe mode — reading MJPEG from stdin, serving on http://0.0.0.0:{port}")
        reader_thread = threading.Thread(target=pipe_reader, daemon=True)
    else:
        print(f"📷 OpenCV mode — capturing from /dev/video{args.device}, serving on http://0.0.0.0:{port}")
        reader_thread = threading.Thread(target=opencv_reader, args=(args.device,), daemon=True)

    reader_thread.start()
    server = socketserver.ThreadingTCPServer(("0.0.0.0", port), MJPEGHandler)
    server.allow_reuse_address = True
    server.serve_forever()
