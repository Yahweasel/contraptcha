# Contraptcha

Contraptcha is a word-based puzzle game inspired by terrible AI-generated art,
Wordle, and Semantle. Try to guess what the AI is thinking.

For more information, just play the game! https://contraptcha.com/


## Building puzzles

The pipeline for puzzle-building works like so:

```
Generate (AI imagery) → OCR → censor text →
                                           → puzzle
               Extract semantic distances →
```

The generation of imagery and OCR are ML tasks, and thus have the most
complexity. The entire process can be driven by the `generate.sh` script in the
`generate` directory (note: not the `generate.js` script, which just generates
images).

The larger steps are documented here.


### Generating imagery

The `generate.js` script in the `generate` directory generates the actual
imagery. But, more precisely, it just uses the HTTP interface to
[ComfyUI](https://github.com/comfyanonymous/ComfyUI). The author has only ever
tested it with ComfyUI in turn installed through
[StableSwarmUI](https://github.com/Stability-AI/StableSwarmUI). You should have
StableSwarmUI up and running before attempting to do anything else.

In the `output` directory of ComfyUI, `out` should be symlinked to a (new)
`generate/out` directory here. All necessary models (see the header of
`generate.js` for the list of used models) should be installed. Then, just run
`generate.js` which the list of words to generate as arguments. You can look at
`generate.sh` to see how the wordlists are selected for the site (it's not
complicated).

Each puzzle is given a random seed, and that random seed is both used as an
identifier for the puzzle and used as the actual random seed for AI image
generation (actually, it uses seed, seed+1, seed+2, and seed+3, just in case the
models are related to each other and would generate similar imagery with the
same seed). Image files are generated to
`generate/out/<seed>/<seed>_<part>_000001_.png`. The `<part>` represents which
words are active and inactive in the prompt. If the (0-indexed) 0th, 3rd, and
fifth word are active, then `<part>` is `1<<0+1<<3+1<<5 = 29` (in hex). `<part>`
is always two hex digits.

`generate.js` can also create a `meta.json` file.


### NSFW detection

NSFW imagery is detected by [NudeNet](https://github.com/notAI-tech/NudeNet).
NudeNet must be installed to a virtualenv directory named `nsfw/venv`. It can be
installed with `pip -r requirements.txt`.

The NSFW detector is called automatically by `generate.js`. You should not need
to run it explicitly.


### OCR

OCR is performed by [EasyOCR](https://github.com/JaidedAI/EasyOCR). EasyOCR must
be installed to a virtualenv directory named `easyocr/venv`. It can be installed
with `pip -r requirements.txt`, but note that if your PyTorch will not use Cuda
(e.g., the author's uses RoCM), you will need to explicitly install PyTorch
before installing the `requirements.txt` dependencies. At that point, `eocr.py`
is a script which OCR's each file in its arguments, leaving the results in a
file `<input>.ocr.json`.

OCR'ing is much faster than image generation, but is still an ML task, so is not
remarkably fast.


### Censor

The purpose of OCRing, above, isn't actually to extract English text, but to
*censor* English text. Unfortunately, AI-generated art tends to give away the
solutions to some puzzles by just writing out prompt words in text. Once the
`ocr.json` files have been created, `censor/censor.js` (which requires
dependencies installable with `npm install`) can use that OCR data to censor the
image.

If `in.png` is the image you wish to censor, `in.png.ocr.json` already exists,
and you want to create `out.png`, simply run `./censor.js in.png out.png`.


### The rest

All dependencies for conversion can be built/installed with `make`.

The other steps are just data wrangling, and are all performed by `convert.js`.
`convert.js` looks over all the seeds in `generate/out`, censors them, extracts
semantic similarity, converts them to WebP, and puts all data in place in
`game/assets`. The game itself uses that assets directory to find, well, assets.

`generate.js` takes an optional argument to write a `meta.json` file in which a
seed can be marked as queued for one of the daily puzzles. When a seed is queued
for a daily puzzle, a JSON file is put in `game/assets/dailies`. The
`activate-daily.js` script selects a seed from a JSON file in that directory at
random and makes it the daily puzzle.
