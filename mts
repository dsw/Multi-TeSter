#!/usr/bin/perl -w
# -*- cperl -*-

# Multi-TeSter, mts, implements a domain-specific language, MTS, for
# generating and running multiple modes of similar tests from a single
# source.  1) For each mode MTS runs a command line and then checks
# that the expected exit code, stdout, and stderr result, failing if
# they do not.  2) An MTS input file can have multiple modes and all
# of the above aspects of running the program being tested can depend
# on the current mode; this feature allows multiple very similar tests
# to be expressed in one file, re-using their commonality.
#
# You can read the documentation and the license under which MTS is
# released by typing:
#   mts --help
# You can also find the documentation, copyright, and license embedded
# in this script at the end after __DATA__.
#
# Daniel S. Wilkerson

# Bugs; search for FIX below:
#
# For getting the results of a system call, "perldoc system" says to
# be portable to use the "W*() calls of the POSIX extension; see
# perlport for more information."

use strict;
use warnings FATAL => 'all';

# the version of MTS; can be asserted by the user
my $version = "MTS-2008-01-11";

# these variable are substituted just before running the test
my @lateSubBuiltinVars = qw(FILES FIRST_FILE OTHER_FILES MODE);
my @builtinVars = ("THIS", @lateSubBuiltinVars);
my %builtinVars;
for my $builtin (@builtinVars) {
  ++$builtinVars{$builtin};
}

# command-line state; set once by readCommandLine and subsequent
# scanning of the first file in the input files
my $progName = $0;              # record the program name
my $verbose;                    # comment on what we are doing
my $quiet;                      # don't print modes as they are tested
my $recordInputFile;            # record input files that pass here
my $print_cmdline_state;        # print the command line state and exit
my $print_xform_state;          # print the xform state and exit
my $print_commands = 1;         # print commands as they are run
my $keep_temp_files = 0;        # keep the temporary files
my $pre = "MTS";                # the prefix to use
my $diff = "diff";              # the diff program to use
my @cfgFilesRead;               # sequence of configuration files read
my %cfgFilesRead;               # set of configuration files read
my %interpVars;                 # interpolation variables
my @inputModes;                 # modes to use
my %inputModes;                 # prevent duplicates
my $inputDir = "";              # the input directory
my $inputFile;                  # the input file

# regexes that match mode and file names
my $base_mode_re = "[_0-9a-zA-Z]+";
my $base_file_re = "[-_.0-9a-zA-Z]+\.mts";
my $base_var_re  = "[_a-zA-Z][_a-zA-Z0-9]*";

# xformFile state; set by xformFile each time it runs
my @modes;                      # modes found in MTS_modes() lines
my %modes;                      # prevent dupliates
my %allModes;                   # modes union omitted modes
my %mode2other;                 # map a mode to its MTS_other lists
my %mode2prog;                  # map a mode to its MTS_prog line
my %mode2progLoc;               # map a mode to the loc of its MTS_prog line
my %mode2exit;                  # map a mode to its MTS_exit line
my %mode2out;                   # map a mode to its MTS_expout lines
my %mode2err;                   # map a mode to its MTS_experr lines

# read one flag; return true iff it was a flag
sub readFlag {
  my ($arg, $loc) = @_;
  die unless defined $arg;
  die unless defined $loc;
  if (0) {                      # orthogonality
  } elsif ($arg =~ /^-(-?)help$/) {
    printDoc();
    exit(0);
  } elsif ($arg =~ /^--verbose$/) {
    ++$verbose;
  } elsif ($arg =~ /^--quiet$/) {
    ++$quiet;
  } elsif ($arg =~ /^--record-input-file=(.+)$/) {
    $recordInputFile = $1;
  } elsif ($arg =~ /^--print-cmdline-state$/) {
    ++$print_cmdline_state;
  } elsif ($arg =~ /^--print-xform-state$/) {
    ++$print_xform_state;
  } elsif ($arg =~ /^--print-commands=(.*)$/) {
    $print_commands = $1;
  } elsif ($arg =~ /^--keep-temp-files=(.*)$/) {
    $keep_temp_files = $1;
  } elsif ($arg =~ /^--pre=([a-zA-Z]+)$/) {
    $pre = $1;
  } elsif ($arg =~ /^--diff=(.+)$/) {
    $diff = $1;
  } elsif ($arg =~ /^--cfg=(.+)$/) {
    readCfgFile($1);
  } elsif ($arg =~ /^--set:(${base_var_re})=(.*)$/o) {
    $interpVars{$1} = $2;
    chomp $interpVars{$1};
  } elsif ($arg =~ /^--mode=(${base_mode_re})$/o) {
    checkMode($1, $loc);
    push @inputModes, $1 unless $inputModes{$1}++;
  } elsif ($arg =~ /^--/) {
    die "$loc: Unrecognized or malformed flag: '$arg';\n".
      "type $progName --help for help\n";
  } else {
    return 0;
  }
  return 1;
}

# read a configuration file
sub readCfgFile {
  print "readCfgFile\n" if $verbose;
  my ($cfgFile) = @_;
  # check for configuration file cycles
  push @cfgFilesRead, $cfgFile;
  if ($cfgFilesRead{$cfgFile}++) {
    print "Cycle in configuration files:\n";
    for my $file (@cfgFilesRead) {
      print "  $file";
    }
    die "";
  }

  # read the file
  my $lineno = 0;
  open CFG, $cfgFile or die "$!: $cfgFile\n";
  while(<CFG>) {
    ++$lineno;
    s/\#.*$//;                  # delete hash-to-EOL comments
    s/^\s*//;                   # trim leading whitespace
    next if /^\s*$/;            # skip blank lines
    my $loc = "$cfgFile:$lineno";
    my $wasAFlag = readFlag($_, $loc);
    die "$loc: Configuration file must contain a legal flag" unless $wasAFlag;
  }
  close CFG or die "$!: $cfgFile\n";
}

# parse the command line
sub readCommandLine {
  print "readCommandLine\n" if $verbose;
  unless (@ARGV) {
    printDoc();
    exit(0);
  }
  while(1) {
    my $arg = shift @ARGV;
    last unless defined $arg;
    chomp $arg;

    # read the flag if we have one
    my $res = readFlag($arg, "command-line");
    next if $res;

    # not a flag: must be an input filename
    die "May not specify two input files.\n" if defined $inputFile;
    if ($arg =~ m|^(.*/)([^/]+)$|) {
      my ($dir, $file) = ($1, $2);
      die unless defined $dir;
      die unless defined $file;
      $inputDir = $dir;
      $inputFile = $file;
    } else {
      # $inputDir is left unchanged
      $inputFile = $arg;
    }
  }

  # print the state if wanted
  if ($print_cmdline_state) {
    printCmdLineState();
    exit(0);
  }

  # check integrity
  checkTheInterpVars();
  die "No input file given; type $progName --help for help.\n"
    unless $inputFile;
  checkFile($inputFile, "command-line");
}

# check that the interpolation variables do not contain the prefix as
# this is very likely a mistake and can always be avoided by changing
# the variable name
sub checkTheInterpVars {
  while (my ($var, $val) = each (%interpVars)) {
    if ($builtinVars{$var}) {
      die "Variable '$var' has the same name as a built-in variable.\n";
    }
    if ($var =~ /$pre/) {
      die <<"INTERP_ERR"
Interpolation variable '$var' contains the prefix '$pre'.
Pick a different name for your variable.
INTERP_ERR
  ;
    }
  }
}

# interpolate the interpolation variables; if $delete is set, just
# delete the values instead; Note that we substitute going forward and
# never re-substitute something already substituted; this prevents the
# pathological case where substituting two consecutive variables makes
# the name of a third and gets us into an infinite loop
sub interpTheInterpVars {
  my ($loc, $str, $delete) = @_;
  die unless defined $loc;
  while ($str =~ m/$pre/g) {
    pos($str) -= length($pre);  # back up to the start of the match
    # find the longest variable name that matches at this position
    my $matchVar;
    while (my ($var, $val) = each (%interpVars)) {
      my $preVar = "${pre}_${var}"; # my editor makes me do this
      if ($str =~ /\G$preVar/gc) {
        pos($str) -= length($preVar); # back up to the start of the match
        if (defined $matchVar) {
          my $diff = length($var) - length($matchVar);
          die if $diff == 0;
          if ($diff > 0) {$matchVar = $var;}
          # otherwise, leave matchVar as the winner
        } else {
          $matchVar = $var;
        }
      }
    }
    # there should be exactly one
    die "$loc: Found the prefix '$pre' but none of the variables match.\n"
      unless defined $matchVar;
    # substitute the variable that matches
    my $val;
    if ($delete) {$val = "";}
    else         {$val = $interpVars{$matchVar};}
    die "$loc: Variable '$matchVar' not defined.\n" unless defined $val;
    my $preVar = "${pre}_${matchVar}"; # my editor makes me do this
    my $savePos = pos($str);
    die "$loc: Variable '$matchVar' matched and now it doesn't?\n"
      unless $str =~ s/\G$preVar/$val/;
    pos($str) = $savePos + length($val); # go forward past the substitution
  }
  return $str;
}

# delete the interpolation variables
sub deleteTheInterpVars {
  my ($loc, $str) = @_;
  return interpTheInterpVars($loc, $str, 1);
}

# print the documentation and usage
sub printDoc {
  while(<DATA>) {print;}
}

# print the program state
sub printCmdLineState {
  print "Command-line state:\n";
  print "pre: '$pre'\n" if defined $pre;
  print "diff: '$diff'\n" if defined $diff;
  print "modes:\n";
  for my $mode (@inputModes) {
    print "  '$mode'\n";
  }
  print "inputDir: '$inputDir'\n";
  print "inputFile: '$inputFile'\n";
}

sub printXformFileState {
  print "xForm state:\n";
  print "modes:\n";
  for my $mode (@modes) {
    print "  '$mode'\n";
  }
  print "mode2other:\n";
  while(my ($mode, $other) = each(%mode2other)) {
    print "  '$mode'->";
    print(join(" ", @{$mode2other{$mode}}));
    print "\n";
  }
  print "mode2prog:\n";
  while(my ($mode, $prog) = each(%mode2prog)) {
    print "  '$mode'-> $prog\n";
  }
  print "mode2progLoc:\n";
  while(my ($mode, $progLoc) = each(%mode2progLoc)) {
    print "  '$mode'-> $progLoc\n";
  }
  print "mode2exit:\n";
  while(my ($mode, $exit) = each(%mode2exit)) {
    print "  '$mode'-> $exit\n";
  }
  print "mode2out:\n";
  while(my ($mode, $out) = each(%mode2out)) {
    print "  '$mode'->\n----\n${out}----\n";
  }
  print "mode2err:\n";
  while(my ($mode, $err) = each(%mode2err)) {
    print "  '$mode'->\n----\n${err}----\n";
  }
}

sub clearXformFileState {
  print "clearXformFileState\n" if $verbose;
  undef @modes;
  undef %modes;
  undef %allModes;
  undef %mode2other;
  undef %mode2prog;
  undef %mode2progLoc;
  undef %mode2exit;
  undef %mode2out;
  undef %mode2err;
}

# check a modename
sub checkMode {
  my ($mode, $loc) = @_;
  die unless defined $mode;
  die unless defined $loc;
  die "$loc: Bad mode name '$mode'; mode name must consist of:\n".
      "alphas, nums, and underscores.\n"
      unless $mode =~ /^${base_mode_re}$/o;
}

# check a filename
sub checkFile {
  my ($file, $loc) = @_;
  die unless defined $file;
  die unless defined $loc;
  die "$loc: Bad file name '$file'; file name must consist of:\n".
      "alphas, nums, underscore, dashes, and dots and must end in '.mts'.\n"
      unless $file =~ /^${base_file_re}$/o;
}

# make transformed filename
sub xformFileName {
  my ($file, $mode, $kind) = @_;
  die unless defined $file;
  die unless defined $mode;
  die unless defined $kind;
  checkMode($mode, "should not happen");
  chomp $file;                  # should not be necessary
  my ($fileBase, $fileEnd) = ($file =~ /^([^\.]+)(\..+)?\.mts$/);
  die "Unable to parse filename: '$file'\n" unless defined $fileBase;
  $fileEnd = "" unless defined $fileEnd;
  my $ret = "${inputDir}${pre}_${fileBase}_${mode}${fileEnd}${kind}";
  return $ret;
}

# read and transform a file; accumulate the result in the above state;
# only transform the file if $mode is defined; otherwise we just
# accumulate the state defined by the commands
sub xformFile {
  print "xformFile\n" if $verbose;
  my ($file, $xformMode) = @_;
  die unless defined $file;

  # lexer regular expressions; NOTE: these interpolate $pre so they
  # can't go inot some global scope unless that is carefully done; it
  # is much safer to just put them here
  my $comment_re = "^\\s*${pre}:.*\$";
  my $version_re = "^\\s*${pre}_version\\(([^)]*)\\)\\s*\$";
  my $modes_re   = "^\\s*${pre}_modes\\(([^)]*)\\)\\s*\$";
  my $omitmodes_re = "^\\s*${pre}_omitmodes\\(([^)]*)\\)\\s*\$";
  my $other_re   = "^\\s*${pre}_other\\(([^)]*)\\)\\s*:\\s*(.*)\$";
  my $prog_re    = "^\\s*${pre}_prog\\(([^)]*)\\)\\s*:\\s*(.*)\$";
  my $exit_re    = "^\\s*${pre}_exit\\(([^)]*)\\)\\s*:\\s*(.*)\$";
  my $out_re     = "^\\s*${pre}_exp(out\|err)\\(([^)]*)\\)\\s*(:|;)(.*)\$";
  my $outblk_re  = "^\\s*${pre}_exp(out\|err)\\(([^)]*)\\)\\s*(\\{|\\})\\s*\$";
  my $add_re     = "${pre}_add\\(([^)]*)\\)";
  my $sub_re     = "${pre}_sub\\(([^)]*)\\)";

  # clear our state
  clearXformFileState();
  for my $var (@builtinVars) {
    die if defined $interpVars{$var};
  }

  # open input file
  die unless defined $file;
  open FILE, "$inputDir$file" or die "$!: $inputDir$file\n";

  # open the input file
  my $inFile;
  if (defined $xformMode) {
    # FILE.END -> FILE_$xformMode.END
    $inFile = xformFileName($file, $xformMode, "");
    $interpVars{"THIS"} = $inFile;
    unlink $inFile;
    open INFILE, ">$inFile" or die "$!: $inFile\n";
  }

  # iterate over file
  my $lineno = 0;
  my $outRecMode;  # out mode being recorded or undef if not recording
  my $errRecMode;  # err mode being recorded or undef if not recording
  my $outRecMode_startLoc; # starting block of out mode being recorded
  my $errRecMode_startLoc; # starting block of err mode being recorded
  while(<FILE>) {
    ++$lineno;
    my $loc = "$inputDir$file:$lineno";

    # MTS: This is a comment.
    if (/$comment_re/o) {
      # discard this line
    }

    # MTS_version(version_string)
    elsif (/$version_re/o) {
      die "$loc: Version mismatch.\n" unless $version eq $1;
    }

    # MTS_modes(MODE_LIST)
    elsif (/$modes_re/o) {
      die "$loc: Command not allowed within an expout block.\n" if $outRecMode;
      die "$loc: Command not allowed within an experr block.\n" if $errRecMode;
      for my $mode (split /\s*,\s*/, $1) {
        checkMode($mode, $loc);
        # NOTE: there is NO interpolation of modes
        push @modes, $mode unless $modes{$mode}++;
        ++$allModes{$mode};
      }
    }

    # MTS_omitmodes(MODE_LIST)
    elsif (/$omitmodes_re/o) {
      die "$loc: Command not allowed within an expout block.\n" if $outRecMode;
      die "$loc: Command not allowed within an experr block.\n" if $errRecMode;
      for my $mode (split /\s*,\s*/, $1) {
        checkMode($mode, $loc);
        # NOTE: there is NO interpolation of modes
        ++$allModes{$mode};
      }
    }

    # MTS_other(MODE_LIST):LIST_OF_OTHER_FILES
    elsif (/$other_re/o) {
      die "$loc: Command not allowed within an expout block.\n" if $outRecMode;
      die "$loc: Command not allowed within an experr block.\n" if $errRecMode;
      my $modes = $1;
      my $otherFilesLine = $2;
      for my $mode (split /\s*,\s*/, $modes) {
        checkMode($mode, $loc);
        die "$loc: Unknown mode: '$mode'\n" unless defined $allModes{$mode};
        next unless defined $modes{$mode};
        my @otherFiles = split " ", $otherFilesLine;
        for my $file (@otherFiles) {
          checkFile($file, $loc);
        }
        # NOTE: there is NO interpolation of other filenames
        push @{$mode2other{$mode}}, @otherFiles;
      }
    }

    # MTS_prog(MODE_LIST):PROG
    elsif (/$prog_re/o) {
      die "$loc: Command not allowed within an expout block.\n" if $outRecMode;
      die "$loc: Command not allowed within an experr block.\n" if $errRecMode;
      my $prog = $2;
      chomp $prog;
      # this is done later so that special variables which are unknown
      # now, such as the list of files, can be interpolated
#       $prog = interpTheInterpVars($loc, $prog) if defined $xformMode;
      for my $mode (split /\s*,\s*/, $1) {
        checkMode($mode, $loc);
        die "$loc: Unknown mode: '$mode'\n" unless defined $allModes{$mode};
        next unless defined $modes{$mode};
        # allow concatenation for now; not sure it is a good idea
#         if (defined $mode2prog{$mode}) {
#           die "$loc: Duplicate prog line for mode $mode.\n";
#         }
        # add the space so tokens do not accidentally concatenate
        # across lines
        $mode2prog{$mode} .= "$prog ";
        # Note that if the prog line is spread across multiple prog
        # commands and there is later an error in the prog line, say
        # during interpolation, the error location will be reported as
        # having occurred on the first line; it is otherwise too
        # difficult to track the source location information.
        $mode2progLoc{$mode} = $loc unless $mode2progLoc{$mode};
      }
    }

    # MTS_exit(MODE_LIST):EXIT_VALUE
    elsif (/$exit_re/o) {
      die "$loc: Command not allowed within an expout block.\n" if $outRecMode;
      die "$loc: Command not allowed within an experr block.\n" if $errRecMode;
      my $exit = $2;
      chomp $exit;
      $exit = interpTheInterpVars($loc, $exit) if defined $xformMode;
      for my $mode (split /\s*,\s*/, $1) {
        checkMode($mode, $loc);
        die "$loc: Unknown mode: '$mode'\n" unless defined $allModes{$mode};
        next unless defined $modes{$mode};
        if (defined $mode2exit{$mode}) {
          die "$loc: Duplicate exit value line for mode $mode\n";
        }
        $mode2exit{$mode} = $exit;
      }
    }

    # MTS_expout(MODE_LIST):LINE_OF_OUTPUT
    # MTS_experr(MODE_LIST):LINE_OF_OUTPUT
    # MTS_expout(MODE_LIST);LINE_OF_OUTPUT
    # MTS_experr(MODE_LIST);LINE_OF_OUTPUT
    elsif (/$out_re/o) {
      die "$loc: Command not allowed within an expout block.\n" if $outRecMode;
      die "$loc: Command not allowed within an experr block.\n" if $errRecMode;
      my $stream = $1;
      my $modes = $2;
      my $newlineFlag = $3;
      my $line = $4;
      chomp $line;
      if ($newlineFlag =~ /:/) { # put newline back
        $line .= "\n";
      } elsif ($newlineFlag =~ /;/) { # leave without a newline
      } else {
        die "$loc: Expected colon or semicolon after mode list\n";
      }
      $line = interpTheInterpVars($loc, $line) if defined $xformMode;
      for my $mode (split /\s*,\s*/, $modes) {
        checkMode($mode, $loc);
        die "$loc: Unknown mode: '$mode'\n" unless defined $allModes{$mode};
        next unless defined $modes{$mode};
        if    ($stream eq "out") {$mode2out{$mode} .= $line;}
        elsif ($stream eq "err") {$mode2err{$mode} .= $line;}
        else {
          die "$loc: Line has prefix '$pre' but no well-formed".
            " embedded command.\n";
        }
      }
    }

    # MTS_expout(MODE){
    # MTS_experr(MODE){
    # MTS_expout(MODE)}
    # MTS_experr(MODE)}
    elsif (/$outblk_re/o) {
      my $stream = $1;
      my $mode = $2;            # NOTE: one mode, not a list
      my $startStop = $3;
      my $startStopVal;
      if    ($startStop eq "{") {$startStopVal = 1;}
      elsif ($startStop eq "}") {$startStopVal = 0;}
      else {
        die "$loc: Line has prefix '$pre' but no well-formed\n".
          " embedded command.\n";
      }
#       for my $mode (split /\s*,\s*/, $modes) {
      # extra error reporting just to be extra clear
      die "$loc: Only ONE mode, not a list, allowed for exp(out,err).\n"
        if $mode =~ /,/;
      checkMode($mode, $loc);
      die "$loc: Unknown mode: '$mode'\n" unless defined $allModes{$mode};
      if (defined $modes{$mode}) {
        if ($stream eq "out") {
          die "$loc: May not open nor close an expout block ".
            "when in an experr block\n"
              if $errRecMode;
          if ($startStopVal) {
            die "$loc: Attempt to open an expout block when already in one.\n"
              if $outRecMode;
            $outRecMode = $mode;
            $outRecMode_startLoc = $loc;
          } else {
            die "$loc: Attempt to close an expout block when not in one.\n"
              unless $outRecMode;
            die "$loc: Attempt to close an expout block for a mode "
              . "other than the one that is open.\n"
                unless $outRecMode eq $mode;
            undef $outRecMode;
          }
        } elsif ($stream eq "err") {
          die "$loc: May not open nor close an experr block ".
            "when in an expout block\n"
              if $outRecMode;
          if ($startStopVal) {
            die "$loc: Attempt to open an experr block when already in one.\n"
              if $errRecMode;
            $errRecMode = $mode;
            $errRecMode_startLoc = $loc;
          } else {
            die "$loc: Attempt to close an experr block when not in one.\n"
              unless $errRecMode;
            die "$loc: Attempt to close an experr block for a mode "
              . "other than the one that is open.\n"
                unless $errRecMode eq $mode;
            undef $errRecMode;
          }
        } else {
          die "$loc: Line has prefix '$pre' but no well-formed".
            " embedded command.\n";
        }
      }
#       }
    }

    # MTS_add(MODE_LIST)
    elsif (s/$add_re//o) {
      die "$loc: Command not allowed within an expout block.\n" if $outRecMode;
      die "$loc: Command not allowed within an experr block.\n" if $errRecMode;
      if (defined $xformMode) {
        for my $mode (split /\s*,\s*/, $1) {
          checkMode($mode, $loc);
          die "$loc: Unknown mode: '$mode'\n" unless defined $allModes{$mode};
          next unless defined $modes{$mode};
          if ($xformMode eq $mode) {
            $_ = interpTheInterpVars($loc, $_) if defined $xformMode;
            print INFILE $_ if defined $xformMode;
          }
        }
      }
    }

    # MTS_sub(MODE_LIST)
    elsif (s/$sub_re//o) {
      die "$loc: Command not allowed within an expout block.\n" if $outRecMode;
      die "$loc: Command not allowed within an experr block.\n" if $errRecMode;
      if (defined $xformMode) {
        for my $mode (split /\s*,\s*/, $1) {
          checkMode($mode, $loc);
          die "$loc: Unknown mode: '$mode'\n" unless defined $allModes{$mode};
          next unless defined $modes{$mode};
          if (! ($xformMode eq $mode)) {
            $_ = interpTheInterpVars($loc, $_) if defined $xformMode;
            print INFILE $_ if defined $xformMode;
          }
        }
      }
    }

    # unadorned line
    elsif (defined $xformMode) {
      $_ = interpTheInterpVars($loc, $_) if defined $xformMode;
      if    ($outRecMode) {$mode2out{$outRecMode} .= $_;}
      elsif ($errRecMode) {$mode2err{$errRecMode} .= $_;}
      else                {print INFILE $_;}
    }
  }
  die "$outRecMode_startLoc: Unterminated expout block.\n"
    if $outRecMode;
  die "$errRecMode_startLoc: Unterminated experr block.\n"
    if $errRecMode;

  # clean up
  for my $var (@builtinVars) {
    undef $interpVars{$var};
  }
  if (defined $xformMode) {
    close INFILE or die "$!: $inFile\n";
    chmod 0440, $inFile;
  }
  close FILE or die "$!: $inputDir$file\n";
}

# run the given command and return its exit value unless it dies in
# some exotic way
sub runCommand {
  # FIX: "perldoc system" says to be portable to use the "W*() calls
  # of the POSIX extension; see perlport for more information."
  my ($cmd) = @_;
  die unless $cmd;
  print "$cmd\n" if $print_commands && ! $quiet;
  my $res = system($cmd);
  if ($res == -1) {
    die "Failed to execute: $cmd\n";
  } elsif ($res & 127) {
    my $msg = sprintf("child died with signal %d.\n", $res & 127);
    die $msg;
  }
  my $exitValue = $res >> 8;
  return $exitValue;
}

# delete temporary files
sub deleteFile {
  my ($filename) = @_;
  print "deleteFile: $filename\n" if $verbose;
  my $numDeleted = unlink $filename;
  die "Error deleting file: $filename\n" unless $numDeleted == 1;
}

# run one test in a given mode
sub runTest {
  my ($mode) = @_;
  print "runTest: $mode\n" if $verbose;
  checkMode($mode, "should not happen");

  unless ($quiet) {
    if ($print_commands) {
      print "\n* ";
    } else {
      print "  ";
    }
    print "$inputFile, $mode\n";
  }

  # transform the first file and get the input file state
  xformFile($inputFile, $mode);
  die "$inputFile mode: $mode; transformed a file in a mode".
    " for which there is no 'modes' line.\n"
      unless $modes{$mode};

  # get the prog
  my $prog = $mode2prog{$mode};
  die "$inputFile mode $mode; transformed a file in a mode".
    " for which there is no 'prog' line.\n"
      unless $prog;

  # compute the files variable for the prog line
  # FILE.END -> FILE_$mode.END
  # files first
  my $filesFirst = xformFileName($inputFile, $mode, "");
  # files other
  my $filesOther;
  my %filesOtherSet;
  ++$filesOtherSet{$filesFirst};
  for my $otherFile (@{$mode2other{$mode}}) {
    my $otherXformedFile = xformFileName($otherFile, $mode, "");
    die "File '$otherFile' listed twice for mode '$mode'.\n"
      if $filesOtherSet{$otherXformedFile}++;
    $filesOther .= " $otherXformedFile";
  }
  # files list
  my $filesList = $filesFirst;
  $filesList .= " $filesOther" if defined $filesOther;

  # interpolate the prog line
  for my $var (@lateSubBuiltinVars) {
    die if defined $interpVars{$var};
  }
  %interpVars = (%interpVars,
                 FILES       => $filesList,
                 FIRST_FILE  => $filesFirst,
                 OTHER_FILES => $filesOther,
                 MODE        => $mode,
                );
  $prog = interpTheInterpVars($mode2progLoc{$mode}, $prog);
  for my $var (@lateSubBuiltinVars) {
    undef $interpVars{$var};
  }

  # get the exit value
  my $exit = $mode2exit{$mode};
  $exit = 0 unless defined $exit; # default to 0 == Un*x success

  # print the expected stdout: FILE.END -> FILE_$mode.END.expout
  my $expectOut = xformFileName($inputFile, $mode, ".expout");
  unlink $expectOut;
  open EXPECT_OUT, ">$expectOut" or die "$!: $expectOut\n";
  print EXPECT_OUT $mode2out{$mode} if defined $mode2out{$mode};
  close EXPECT_OUT or die "$!: $expectOut\n";
  chmod 0440, $expectOut;

  # print the expected stderr: FILE.END -> FILE_$mode.END.experr
  my $expectErr = xformFileName($inputFile, $mode, ".experr");
  unlink $expectErr;
  open EXPECT_ERR, ">$expectErr" or die "$!: $expectErr\n";
  print EXPECT_ERR $mode2err{$mode} if defined $mode2err{$mode};
  close EXPECT_ERR or die "$!: $expectErr\n";
  chmod 0440, $expectErr;

  # IMPORTANT: past this point the xformFile state is going to be
  # wiped out by further calls to xformFile for the other files, so do
  # not rely upon it.
  my @otherFiles = @{$mode2other{$mode}};
  clearXformFileState();

  # transform the other file's names
  for my $file (@otherFiles) {
    checkMode($mode, "should not happen");
    xformFile($file, $mode);
  }

  # run the program
  # FILE.END -> FILE_$mode.END.stdout
  my $out = xformFileName($inputFile, $mode, ".stdout");
  # FILE.END -> FILE_$mode.END.stderr
  my $err = xformFileName($inputFile, $mode, ".stderr");
  my $resExit = runCommand("$prog > $out 2> $err");
  if (!($resExit == $exit)) {
    die
      "$inputFile: mode $mode; expected and actual exit values differ;\n".
      "expected: $exit; actual: $resExit;\nprog: $prog\n";
  }

  # check the stdout diff
  my $diffOutExit = runCommand("$diff $expectOut $out");
  if (!($diffOutExit == 0)) {
    die "$inputFile: mode $mode; expected and actual stdout differ;".
      "\nprog: $prog\n";
  }

  # check the stderr diff
  my $diffErrExit = runCommand("$diff $expectErr $err");
  if (!($diffErrExit == 0)) {
    die "$inputFile: mode $mode; expected and actual stderr differ;".
      "\nprog: $prog\n";
  }

  # test passes
  unless ($keep_temp_files) {
    # delete the temporary files
    deleteFile(xformFileName($inputFile, $mode, ""));
    for my $file (@otherFiles) {
      checkMode($mode, "should not happen");
      deleteFile(xformFileName($file, $mode, ""));
    }
    deleteFile($expectOut);
    deleteFile($expectErr);
    deleteFile($out);
    deleteFile($err);
  }
}

# **** main

eval {
  # get the command line state
  readCommandLine();
  # get the input modes
  if (!@inputModes) {
    print "get the input modes since none specified\n" if $verbose;
    # the second argument is the mode; passing undef means don't output
    # anything
    xformFile($inputFile, undef);
    # print xformState
    if ($print_xform_state) {
      printXformFileState();
      exit(0);
    }
    # save the input modes
    @inputModes = @modes;
  }
  # run tests
  die "Something is wrong as there are no modes at all.\n" unless @inputModes;
  print "for each mode in inputModes: " . join(" ", @inputModes) if $verbose;
  for my $mode (@inputModes) {
    runTest($mode);
  }
  # record that this test was run and passed if that was requested
  if ($recordInputFile) {
    open REC, ">>$recordInputFile" or die "$!: $recordInputFile\n";
    print REC "$inputFile\n";
    close REC or die "$!: $recordInputFile\n";
  }
};
if ($@) {
  warn "$@";
  exit(255);
}

# **** documentation

__DATA__

                 Documentation for mts: Multi-TeSter

Multi-TeSter, mts, implements a domain-specific language, MTS, for
generating and running multiple modes of similar tests from a single
source.  1) For each mode MTS runs a command line and then checks that
the expected exit code, stdout, and stderr result, failing if they do
not.  2) An MTS input file can have multiple modes and all of the
above aspects of running the program being tested can depend on the
current mode; this feature allows multiple very similar tests to be
expressed in one file, re-using their commonality.

Run MTS as follows:

  mts [FLAGS] FILE.mts

This documentation is embedded in MTS at the end; to get MTS to print
this documentation, type:

  mts --help

**** command line arguments

The command line arguments are as follows:

  FLAGS: all of these are optional.
  --help
    Print this documentation and stop.
  --verbose
    MTS comments on what its internals are doing; mostly for debugging
    MTS itself.
  --quiet
    Don't even print modes as they are tested.  Overrides
    --print-commands.
  --record-input-file=REC_FILE
    Record the input file name by appending it to REC_FILE after all
    of its mode tests have passed.
  --print-cmdline-state
    Print out the command line state and stop.
  --print-xform-state
    Print out the state read from the input file configuration
    commands after the first pass over the input file and stop.
  --print-commands=PRINT_COMMANDS
    Print out commands as they are run iff PRINT_COMMANDS evaluates to
    perl-true; on by default.
  --keep-temp-files=KEEP_TEMP_FILES
    Keep the temporary files iff KEEP_TEMP_FILES evaluates to
    perl-true; off by default.
  --prefix=PRE
    Use PRE as the prefix instead of the default "MTS".
  --diff=DIFF
    Use DIFF as the diff program instead of the default "diff".
  --cfg=CONFIG_FILE
    Immediately read in each line of CONFIG_FILE as if it were a
    command-line argument.  The suggested suffix for config files is
    ".mts.cfg".
  --set:VAR=VALUE
    Supply a name-value pair which will be interpolated for the
    argument to prog, exit, expout, experr, add, sub, and in the file
    body.  When multiple variables match at a location (one being a
    prefix of the other) the longest one is substituted.
  --mode=MODE
    Add this mode to the list of modes to run.  It must occur in the
    list of MTS_prog(MODE_LIST) of each file.  If no modes are given,
    those used in the union of the MTS_prog(MODE_LIST) commands of the
    first file are used.

  FILE.mts: This is the 'first file' below; it contains commands for
  including other files and for how to run the test and check if it
  succeeded or not.  The name must end in '.mts'; now however that the
  ending is stripped from the name for each version made for each mode;
  therefore if you are testing a program that requires that the input
  file end in '.foo' your MTS testing files should end in '.foo.mts'.

**** embedded command language

The source files have an embedded command language as follows.  MTS is
a prefix string parameter; it can be reset using --pre=PRE.  MODE_LIST
is a list of string mode names.

** These commands must occur on a line by themselves and the whole
line is not copied to the output.  They can occur in any file.

  MTS_modes(MODE_LIST)
  MTS_omitmodes(MODE_LIST)

Only the modes will be run.  Only the modes union the omitmodes are
allowed.  The omitmodes command gives you a way to turn off a mode
without having to remove everything about it from the file.  The fact
that only the modes union the omitmodes are allowed prevents subtle
errors if a mode name is mis-typed.  If no --mode=MODE arguments are
given on the command line then the modes listed in the first file are
the ones that are run.  If there is more than one such modes or
omitmodes command in the file, their lists respectively concatenate.
Listing a mode in either one is idempotent.

  MTS_version(version_string)

Each version of MTS has an internal version string.  This command
asserts that the internal vesion string is 'version_string'.

  MTS: This is a comment.

A comment; the entire line is deleted and ignored.

** These commands refer to the whole line they are on implicitly as
their argument; the command is deleted from the line as the line is
copied.  They can occur in any of the files.

  MTS_add(MODE_LIST)

Add this line to the file when in one of the modes in MODE_LIST.

  MTS_sub(MODE_LIST)

Subtract this line from the file when in one of the modes in
MODE_LIST.

** These commands must occur on a line by themselves and the whole
line is not copied to the output.  They can occur only in the first
file in the files list: the one given on the command line.

  MTS_other(MODE_LIST):LIST_OF_OTHER_FILES

Include other files in the files list: interpolate them as MTS_OTHER
and include them in MTS_FILES.  LIST_OF_OTHER_FILES is a
space-separated list of filenames.  Repeating a file for a given mode
will result in an error.

  MTS_prog(MODE_LIST):PROG

Run the program when in a mode in the mode list.  There must be at
least one such line per mode and multiple lines per mode concatenate.
PROG interpolates MTS_MODE as the mode string and MTS_FILES,
MTS_FIRST_FILE, and MTS_OTHER_FILES as the list of files being
processed, the first file, and the others (not first) files,
respectively.  Note that if the prog line is spread across multiple
prog commands and there is later an error in the prog line, say during
interpolation, the error location will be reported as having occurred
on the first line; it is otherwise too difficult to track the source
location information.

  MTS_exit(MODE_LIST):EXIT_VALUE

Expect the exit value.  Repeating an exit specification for a given
mode will result in an error.

  MTS_expout(MODE_LIST):LINE_OF_OUTPUT
  MTS_experr(MODE_LIST):LINE_OF_OUTPUT

Append LINE_OF_OUTPUT to the expected standard out or err
respectively; replace the colon with a semi-colon to elide the
newline.  The string MTS_THIS is interpolated as the input filename to
each test for each mode.

  MTS_expout(MODE) {
  BLOCK_OF_OUTPUT
  ...
  MTS_expout(MODE) }
  MTS_experr(MODE) {
  BLOCK_OF_OUTPUT
  ...
  MTS_experr(MODE) }

As above but appends an entire block into the expected out or err.
Note that only ONE mode is allowed, not a list of modes.  No commands
other than comments are allowed within an expout or experr block.

**** overview of operation

The modes are determined by accumulating the command-line --mode=MODE
flags, or if there are none, but accumulating the MTS_modes(MODE_LIST)
commands in the first file.  Each mode is a test run separately as
follows.

Given a mode, the file list is traversed and for each file of the form
FILE.END (where the '.' is the first in the filename) the file
FILE_MODE.END is made, following the command language above.  From the
  MTS_expout(..., MODE, ...)
  MTS_expout(MODE) {
  MTS_expout(MODE) }
and
  MTS_experr(..., MODE, ...)
  MTS_experr(MODE) {
  MTS_experr(MODE) }
lines and the the expected standard out and err are assembled,
MTS_THIS is interpolated to FILE_MODE.END, and the expected contents
written to FILE_MODE.expout and FILE_MODE.experr, respectively.  These
three generated files are made read-only to prevent inadvertent
editing in the event of an error reported within them; of course it is
the input to MTS that should be edited.

In the first file there must be exactly one line of the form
  MTS_prog(..., MODE, ...):PROG
PROG is run with MTS_FILES, MTS_FIRST_FILE, and MTS_OTHER_FILES
interpolated as the list of files being processed, the first file, and
the others (not first) files, respectively, and with MTS_MODE
interpolated as the current mode.  Output is redirected to
FILE_MODE.stdout and FILE_MODE.stderr respectively.

There must be one line of the form
  MTS_exit(.., MODE, ...):EXIT_VALUE
The exit value is checked to be EXIT_VALUE; if it is not, the script
dies with "expected and actual exit values differ".  If that passes
then the following command is run:
  DIFF FILE_MODE.stdout FILE_MODE.expout
If diff returns non-zero the diff is displayed and the script dies
similarly as before.  If that passes then the standard err
expectations are checked similarly.

**** usage suggestion: do controlled experiments

If you have a set of conditions that produces a result, it is a bit
hard to know what was essential to those conditions for the result.
However, if you have two very similar sets of conditions one of which
produces the result and the other of which does not, then you know the
*difference* of these two sets contains something essential.  Often it
is easy to make this difference small.  Scientists call this a
"controlled experiment".

The multiple-modes aspect of MTS exists to enable controlled
experiments as follows.  To test a single feature of a piece of
software, it is often necessary to provide a lot of set-up just to get
to the situation where the feature is even relevant.  The best way to
test the feature is to write two input files, one that provides all of
this set-up and then just stops [call this the "control"] and another
that then adds the little bit more needed to invoke the feature [maybe
the "out-of-control"?? :-)].  These two tests will be able to share
most of their set-up, and yet should also produce different results.
To do this with MTS, just write one input file and use, say, the
MTS_add feature to implement the difference between the two modes.

An example of this idiom occurs in the Oink project which computes
whole-program static-time dataflow for C++ programs.  For example, to
test that the dataflow for a pointer-to-member is computed correctly,
I didn't just write a C++ program that used pointers-to-members and
then check that the dataflow graph connected from the source to the
sink.  Instead I run two tests, almost the same except that one has
the pointer-to-member de-reference commented out.  The dataflow graph
should connect for one and not for the other.  A more primitive
version of the script is used for this.

**** usage suggestion: embed a query language

It is simple and templating to have a program generate large outputs
and then record that as the expout in an MTS file and have MTS diff
the actual output with the expected as test.  However, this is really
not the best design: 1) You have entangled the output routines and
whatever other aspect of your program you are testing.  2) Output
routines can loose information, resulting in loss of fidelity.  3) The
print routine is likely to print information on multiple independent
aspects.  4) Loss of abstraction: internal data structures could
change without actually invalidating the test.

Again, with the Oink dataflow tests, we solve this by returning a very
small output: the return value of the oink/qual program indicates
whether or not the graph connected.  Scott McPeak solves this problem
in Elsa, a C++ front-end (the one used by Oink) by simply extending
C++ to contain a query/assertion language.  He can now think of his
tests using a database metaphor, each test having two parts: data and
query.  That is, most of the input is a C++ fragment ("data") that is
parsed and type-checked by Elsa.  When the query language extensions
to C++ are encountered, the Elsa engine runs internal queries and
possibly asserts their results.  Now a test with a large input has a
very small output, namely the query results, or even just the fact
that none of the assertions failed.  The problems in the first
paragraph go away.  One way to look at MTS is as a way of providing
this single-source data/query idiom for programs in general.

**** bugs

Note that the entire input file is re-processed for each mode and
therefore the performance of MTS is quadratic in the number of modes:
each pass has to read and ignore the output for all passes.
Non-trivial performance loss can be significant when the expected
output from each mode is non-trivial.  Therefore, use the multiple
modes feature when the modes tend to share input but when they are
independent, split them into two different files.

**** license

Copyright (c) 2007, 2008
Daniel S. Wilkerson.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

    Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.
    Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in the
    documentation and/or other materials provided with the
    distribution.

    Neither the name of the author, Daniel S. Wilkerson, nor the names
    of other contributors may be used to endorse or promote products
    derived from this software without specific prior written
    permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
