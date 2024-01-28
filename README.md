# Contraptcha

Contraptcha is a word-based puzzle game inspired by terrible AI-generated art,
Wordle, and Semantle. Try to guess what the AI is thinking.

For more information, just play the game! https://contraptcha.com/


## Building puzzles

The pipeline for puzzle-building works like so:

```
Generate (AI imagery) → NSFW detection/removal → OCR → censor text →
                                                                    → puzzle
                                        Extract semantic distances →
```

The generation of imagery, NSFW detection, and OCR are ML tasks, and thus have
the most complexity. The entire process can be driven by the `generate.sh`
script in the `generate` directory (note: not the `generate.js` script, which
just generates images).

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
`generate-img.js` for the list of used models) should be installed. Then, just
run `generate.js` which the list of words to generate as arguments. You can look
at `generate.sh` to see how the wordlists are selected for the site (it's not
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

`generate.js` can also create a `meta.json` file, used currently only to
separate half the seeds into daily puzzles and the other half into general
puzzles.


### NSFW detection

NSFW imagery is detected by [NudeNet](https://github.com/notAI-tech/NudeNet).
NudeNet must be installed to a virtualenv directory named `nsfw/venv`. It can be
installed with `pip -r requirements.txt`.

The NSFW detector is called automatically by `generate.js`. You should not need
to run it explicitly.

The basica approach to NSFW detection and removal is this:

 * First, the image is generated with its normal prompt.
 * Then, it is run through `nsfw-detect.py`, which just determines the Bayesian
   probability of the image having unacceptable nudity (i.e., nudity in one of
   the categories we want to censor), and reports it if that probability is over
   75%.
 * If the image had a 75% chance of nudity, it is regenerated, with “, sfw”
   added to the prompt.
 * The SFW-prompt image is *also* tested with `nsfw-detect.py`.
 * If the SFW-prompt image is also marked as NSFW, then `nsfw-censor.py` is used
   to add black bar censors to the image.

The “raw” output of ComfyUI is named `..._000001_.png`. If that's NSFW, it's
renamed to `..._nsfw.png`, and the SFW-tagged version is generated as
`..._000001_.png`. If that's NSFW, then it's renamed to `..._uncensored.png` and
the censored version is generated as `..._000001_.png`. So, the weirdly named
`..._000001_.png` file is always the correct one, but two other files
representing originals might be made.


### OCR

AI image generation, at least through SDXL, has an unfortunate tendency to just
draw the prompt words on the image, giving away puzzle solutions. “text” is in
the negative prompt, but some positive-prompt words, such as “menu”, overwhelm
that. So, we need to censor out text in the image. This is done with OCR.

OCR is performed by [EasyOCR](https://github.com/JaidedAI/EasyOCR). EasyOCR must
be installed to a virtualenv directory named `easyocr/venv`. It can be installed
with `pip -r requirements.txt`, but note that if your PyTorch will not use Cuda
(e.g., the author's uses RoCM), you will need to explicitly install PyTorch
before installing the `requirements.txt` dependencies. At that point, `eocr.py`
is a script which OCR's each file in its arguments, leaving the results in a
file `<input>.ocr.json`.

OCR'ing is much faster than image generation, but is still an ML task, so is not
remarkably fast.


### Text censoring

The purpose of OCRing, above, isn't actually to extract English text, but to
*censor* English text. Once the `ocr.json` files have been created,
`censor/censor.js` (which requires dependencies installable with `npm install`)
can use that OCR data to censor the image.

If `in.png` is the image you wish to censor, `in.png.ocr.json` already exists,
and you want to create `out.png`, simply run `./censor.js in.png out.png`.

Note that NSFW censoring and text censoring are both censor tasks, but only text
censoring is just named “censor”. This is simply because I implemented text
censoring first, and because NSFW censoring can usually be avoided by image
regeneration.


### The rest

All non-Python dependencies for conversion can be built/installed with `make`.

The other steps are just data wrangling, and are all performed by `convert.js`.
`convert.js` looks over all the seeds in `generate/out`, censors them, extracts
semantic similarity, converts them to WebP, and puts all data in place in
`game/assets`. The game itself uses that assets directory to find, well, assets.

`generate.js` takes an optional argument to write a `meta.json` file in which a
seed can be marked as queued for one of the daily puzzles. When a seed is queued
for a daily puzzle, a JSON file is put in `game/assets/dailies`. The
`activate-daily.js` script selects a seed from a JSON file in that directory at
random and makes it the daily puzzle.


## Generating “ads”

Contraptcha has fake, AI-generated ads for... well, any noun. They're generated
with `generate/generate-ads.js`.
