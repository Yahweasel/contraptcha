#!/bin/sh
set -e
./generate.js -m "$1" $(shuf ../word-list/words.txt | head -n 6)
cd ..
find ./generate/out -name '*.png' \
    -exec ./easyocr/venv/bin/python3 ./easyocr/eocr.py {} +
./convert.js
