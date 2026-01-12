#!/bin/sh
rm -f STOP
ln -sf models-hard.json models.json
while [ ! -e STOP ]
do
    time ./generate.sh '{"hard":true}'
done
