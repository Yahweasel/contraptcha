#!/bin/sh
exec node generate.js -m "$1" $(shuf ../../word-list/words.txt | head -n 6)
