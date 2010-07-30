MTS_modes(m1, m2, m3, m4)
MTS_prog(m1): test MTS_V1 -eq MTS_V2
MTS_prog(m2): test MTS_V1 -eq MTS_V3
MTS:
MTS: test splitting the command across multiple lines
MTS_prog(m3, m4): test MTS_V1
MTS_prog(m3): -eq MTS_V2
MTS_prog(m4): -eq MTS_V3
MTS_exit(m2, m4): 1
