all: \
	convert.js \
	generate/generate.js \
	game/poetcha.js

%.js: %.ts
	../node_modules/.bin/tsc \
		-m commonjs --strict true \
		--target es2015 --moduleResolution node \
		$<

game/poetcha.js: game/poetcha.ts
	../node_modules/.bin/tsc \
		--lib es2015,dom \
		$<
