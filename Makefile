# This makefile tests mts.  See bin/mts for copyright and license.

# Daniel S. Wilkerson

# 'all' is the default target
all:

# delete any automatic suffix rules that I can
.SUFFIXES:


# **** configuration
TEST := Test


# **** parameterization
EXE :=


# **** all
.PHONY: all all-splash
all-splash:; @echo; echo "**** $(@:-splash=)"
all: all-splash $(EXE)


# **** clean
.PHONY: clean clean-splash
clean-splash:; @echo; echo "**** $(@:-splash=)"
clean: clean-splash
	rm -f $(TEST)/MTS_*


# **** check
.PHONY: check check-splash
check-splash:; @echo; echo "**** $(@:-splash=)"
check: check-splash

# check-mts
.PHONY: check-mts
check: check-mts
check-mts:
	@echo
	./mts $(TEST)/mts000.mts ; test $$? -eq 255
	@echo
	./mts foo.mts bar.mts ; test $$? -eq 255
	@echo
	./mts $(TEST)/mts001.foo.mts
	@echo
	./mts $(TEST)/mts002a.bar.mts
	@echo
	./mts $(TEST)/mts003.foo.mts
	@echo
	./mts --pre=MXX $(TEST)/mts004.bar.mts
	@echo
	./mts --set:THIS=hello ; test $$? -eq 255
	@echo
	./mts --set:FILES=hello ; test $$? -eq 255
	@echo
	./mts --set:MTS_FOO=hello ; test $$? -eq 255
	@echo
	./mts --set:V1=1 --set:V2=1 --set:V3=3 $(TEST)/mts005.foo.mts
	@echo
	./mts --cfg=$(TEST)/mts005.mts.cfg $(TEST)/mts005.foo.mts
	@echo
	rm -f $(TEST)/Tests_run
	@echo
	./mts --record-input-file=$(TEST)/Tests_run $(TEST)/mts001.foo.mts
	@echo
	./mts --record-input-file=$(TEST)/Tests_run $(TEST)/mts003.foo.mts
	@echo
	diff $(TEST)/Tests_run.cor $(TEST)/Tests_run
	rm -f $(TEST)/Tests_run
	@echo
	./mts $(TEST)/mts006.mts
	@echo
	./mts $(TEST)/mts007.mts ; test $$? -eq 255
	@echo
	./mts $(TEST)/mts008.mts ; test $$? -eq 255
	@echo
	rm -f $(TEST)/MTS_*
