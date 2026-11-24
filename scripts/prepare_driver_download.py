"""Prepare verified, same-origin driver downloads without personal data."""
import hashlib
import html
import pathlib
import sys
import zipfile

folder = pathlib.Path(sys.argv[1])
source = html.escape(sys.argv[2])
apk = folder / 'gopark-driver.apk'
digest = hashlib.sha256(apk.read_bytes()).hexdigest()
with zipfile.ZipFile(folder / 'gopark-driver.zip', 'w', zipfile.ZIP_STORED) as archive:
    archive.write(apk, 'gopark-driver.apk')
(folder / 'driver-download.html').write_text(f'''<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GoPark — приложение водителя</title>
<style>body{{font:18px system-ui;margin:40px auto;padding:20px;max-width:560px;color:#14251c;background:#f2f7f3}}a{{display:block;padding:18px;margin:16px 0;background:#16843d;color:white;border-radius:14px;text-align:center;text-decoration:none}}small{{overflow-wrap:anywhere}}</style>
<h1>GoPark — водитель</h1><p>Обновлённое приложение для Android.</p>
<a href="/gopark-driver.apk?v={digest[:12]}" download="gopark-driver.apk">Скачать APK</a>
<a href="/gopark-driver.zip?v={digest[:12]}" download="gopark-driver.zip">Скачать ZIP</a>
<p>Если встроенный браузер закрывает скачивание, откройте эту страницу в Chrome.</p>
<small>SHA-256: {digest}<br>Версия кода: {source}</small></html>''', encoding='utf-8')
