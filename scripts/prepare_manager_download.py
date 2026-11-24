#!/usr/bin/env python3
"""Prepare public Android download files without including keys or private data."""
from pathlib import Path
import hashlib
import shutil
import sys
import zipfile

source, destination = map(Path, sys.argv[1:])
destination.mkdir(parents=True, exist_ok=True)
apk = destination / "gopark-manager.apk"
shutil.copyfile(source, apk)
digest = hashlib.sha256(apk.read_bytes()).hexdigest()
with zipfile.ZipFile(destination / "gopark-manager.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    archive.write(apk, "gopark-manager.apk")
size_mb = round(apk.stat().st_size / 1_000_000)
(destination / "manager-download.html").write_text(f"""<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GoPark — приложение бригадира</title>
<style>body{{font:18px system-ui;max-width:600px;margin:40px auto;padding:20px;color:#172b4d}}
a{{display:block;background:#2879ef;color:white;padding:18px;margin:18px 0;border-radius:12px;text-align:center;text-decoration:none}}
small{{overflow-wrap:anywhere}}</style>
<h1>GoPark: приложение бригадира</h1><p>Android. Размер APK: {size_mb} МБ.</p>
<a href="/gopark-manager.apk?v={digest[:12]}" download="gopark-manager.apk">Скачать APK</a>
<a href="/gopark-manager.zip?v={digest[:12]}" download="gopark-manager.zip">Скачать ZIP</a>
<p>Если ссылка открывается и сразу закрывается, откройте эту страницу в Chrome и выберите ZIP.
Распакуйте архив и откройте APK.</p>
<p>Android может попросить разрешить установку приложений из браузера.
Если Android отклоняет обновление из-за несовпадения подписи, потребуется исходный ключ подписи
либо удаление старого приложения перед установкой. После удаления понадобится повторный вход.</p>
<small>SHA256: {digest}</small></html>""", encoding="utf-8")
print(f"Prepared APK SHA256: {digest}")
