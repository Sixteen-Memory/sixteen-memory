# Synthetic duration fixtures

These files were generated locally with FFmpeg (black 64x64, one frame/second,
H.264 MP4, no people or audio). They contain no third-party footage. One has
exactly 1800 seconds; the rejection fixture has 1801 seconds.

```sh
ffmpeg -f lavfi -i color=c=black:s=64x64:r=1 -t 1800 -c:v libx264 \
  -preset ultrafast -pix_fmt yuv420p -movflags +faststart 30min.mp4
# Repeat with -t 1801 for over30min.mp4.
```
