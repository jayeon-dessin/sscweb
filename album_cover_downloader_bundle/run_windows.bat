@echo off
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 download_album_covers.py "sscdbg(2).json"
) else (
  python download_album_covers.py "sscdbg(2).json"
)
echo.
pause
