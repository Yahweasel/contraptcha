#!/bin/sh
set -e
./generate.js -m "$1" -o seed.json $(shuf ../word-list/words.txt | head -n 6)
cd ..
ROCR_VISIBLE_DEVICES=0 find ./generate/out/$(cat generate/seed.json) -name '*.png' \
    -exec ./easyocr/venv/bin/python3 ./easyocr/eocr.py {} +
#./convert.js
