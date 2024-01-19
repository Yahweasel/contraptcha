#!/bin/sh
set -e
./generate.js $(shuf ../word-list/triple-common.txt | head -n 6)
cd ..
./convert.js
