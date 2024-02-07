#!/usr/bin/env python3
import easyocr
import json
import os
import sys
from numpyencoder import NumpyEncoder
reader = None
for file in sys.argv[1:]:
    outfile = "%s.ocr.json" % (file)
    if os.path.exists(outfile):
        continue
    print("OCRing %s" % (file))
    if reader is None:
        reader = easyocr.Reader(["en"])
    result = reader.readtext(file)
    with open(outfile, "w", encoding="utf-8") as fh:
        json.dump(result, fh, cls=NumpyEncoder)
