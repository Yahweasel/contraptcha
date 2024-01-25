#!/bin/sh
ct=0
while [ ! -e STOP ]
do
    if [ "$ct" = "0" ]
    then
        ./generate.sh ''
    else
        ./generate.sh '{"daily":true}'
    fi
    ct=$(((ct+1)%2))
done
