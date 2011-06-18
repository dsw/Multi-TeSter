# test find_foo.py

MTS := $(HOME)/Notes/Multi-TeSter/mts

# use mts
.PHONY: test-mts
test-mts:
	$(MTS) input2.mts

.PHONY: test-mts-verbose
test-mts-verbose:
	$(MTS) --diff='diff -u' --keep-temp-files=1 input2.mts

# do not use mts
.PHONY: test-simple
test-simple:
	./find_foo.py < input1

.PHONY: clean
clean:
	rm -f MTS_*
