앨범 커버 자동 다운로드 도구
============================

1. 이 ZIP을 원하는 폴더에 압축 해제합니다.
2. 인터넷에 연결된 상태에서 실행합니다.

Windows
-------
run_windows.bat 더블클릭

macOS / Linux
-------------
터미널에서 해당 폴더로 이동한 뒤:
  bash run_mac_linux.sh

직접 실행
---------
  python download_album_covers.py "sscdbg(2).json"

동작
----
- artist가 빈 곡은 자동으로 제외합니다. (민요/고전곡 수동 처리용)
- 곡명 + 아티스트로 iTunes/Apple Music Search API를 조회합니다.
- 오매칭 방지를 위해 점수가 낮은 결과는 다운로드하지 않습니다.
- 같은 발매 앨범은 한 이미지 파일을 재사용합니다.
- 가능한 경우 1000 x 1000 정사각형 커버를 요청합니다.
- 결과 JSON에 다음 필드가 추가됩니다:
    "cover": "covers/...jpg"
    "coverAlbum": "..."
    "coverArtist": "..."
- 결과물:
    album_covers_result/covers/
    album_covers_result/sscdbg_with_covers.json
    album_covers_result/matches.csv
    album_covers_result/unmatched.csv
    album_covers_result.zip

번호 매기기
-----------
순번(001, 002...)은 필요 없습니다. 곡 추가/정렬 변경 때 깨질 수 있습니다.
JSON의 cover 경로가 곡과 이미지의 직접 매칭 역할을 합니다.

주의
----
자동 매칭이므로 matches.csv와 unmatched.csv를 한 번 검토하는 것을 권장합니다.
원본 JSON의 year 값은 매칭 점수에 사용하지 않습니다.
