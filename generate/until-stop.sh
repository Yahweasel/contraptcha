#!/bin/sh
rm -f STOP
ln -sf models-standard.json models.json
ct=1
while [ ! -e STOP ]
do
    if [ "$ct" = "0" ]
    then
        time ./generate.sh ''
    else
        time ./generate.sh '{"daily":true}'
    fi
    ct=$(((ct+1)%2))
done
