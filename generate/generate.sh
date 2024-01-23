#!/bin/sh
set -e
./generate.js -m "$1" $(shuf ../word-list/words.txt | head -n 6)
cd ..
. ./easyocr/venv/bin/activate
./easyocr/eocr.py generate/out/*/*.png
./convert.js
