#!/usr/bin/python

# return 0 iff the input contains "foo"

import re
import sys

ret = 1
for line in sys.stdin:
    if re.search(r"foo", line):
        ret = 0

sys.exit(ret)
