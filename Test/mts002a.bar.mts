MTS_modes(m1, m2)
MTS_other(m1):mts002b.bar.mts mts002c.bar.mts
MTS_other(m2):mts002c.bar.mts mts002b.bar.mts
MTS:
MTS_prog(m1, m2): cat MTS_OTHER_FILES MTS_FIRST_FILE
MTS_expout(m2):this is file c
MTS_expout(m1, m2):hello
MTS_expout(m2):hello!
MTS_expout(m1):this is file c
MTS_expout(m1):wheee!
goodbye
MTS_expout(m2, m1):goodbye
alreadyMTS_add(m2)
MTS_expout(m2):already
