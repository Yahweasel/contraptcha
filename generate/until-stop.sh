#!/bin/sh
rm -f STOP
ct=0
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
