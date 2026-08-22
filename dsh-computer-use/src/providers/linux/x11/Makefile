# Build the dsh-computer-use X11 helper on Linux.
# Requires: libx11-dev, libxtst-dev, libxext-dev, zlib1g-dev
CC ?= cc
CFLAGS ?= -O2 -Wall -Wextra -std=c11
LDFLAGS ?= -lX11 -lXtst -lXext -lz

all: dsh-computer-use-x11-helper

dsh-computer-use-x11-helper: helper.c
	$(CC) $(CFLAGS) -o $@ helper.c $(LDFLAGS)

clean:
	rm -f dsh-computer-use-x11-helper

.PHONY: all clean
