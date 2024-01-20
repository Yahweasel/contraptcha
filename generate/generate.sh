#!/bin/sh
set -e
./generate.js $(shuf ../word-list/triple-common.txt | head -n 6)
cd ..
. ./easyocr/venv/bin/activate
./easyocr/eocr.py generate/out/*.png
./convert.js
