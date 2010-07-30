MTS_modes(m1, m2)
MTS_version(MTS-2008-01-11)
MTS_omitmodes(m6)
MTS:
MTS_prog(m1, m2): cat MTS_FILES
MTS:
MTS: this is a comment
MTS:
MTS_modes(m3)
MTS_modes(m4)
MTS_prog(m4): test 1 -eq 2
MTS_prog(m3): cat MTS_FILES
MTS:
MTS_exit(m4): 1
MTS:
line1
MTS_expout(m1, m2):line1
MTS_expout(m3):line1
MTS:
MTS_add(m1)line2
MTS_expout(m1):line2
MTS_add(m2)line2 m2
MTS_expout(m2):line2 m2
MTS:
line3
MTS_expout(m3, m1, m2):line3
MTS:
line4 m2MTS_sub(m1)
MTS_expout(m2):line4 m2
MTS_sub(m1)line4 not m1
MTS_expout(m2):line4 not m1
MTS_expout(m3):line4 m2
MTS_expout(m3):line4 not m1
line five
MTS_expout(m1, m2, m3);line
MTS_expout(m1, m2, m3): five
MTS:
MTS: test stderr
MTS_modes(m5)
MTS_prog(m5): perl -e 'warn "to stderr\nmore\n"'
MTS_experr(m5):to stderr
MTS_experr(m5):more
MTS: 
MTS: check that comment lines can contain strings like MTS_add(m1)
MTS:
MTS: check you can mention a mode that is in the omit list
line sixMTS_add(m6)
