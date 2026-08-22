# dsh-computer-use X11 helper

A small native helper that owns the X11 connection (window enumeration,
screenshots, XTest input, AT-SPI/clipboard are partially stubbed).

## Build

```sh
sudo apt install build-essential libx11-dev libxtst-dev libxext-dev zlib1g-dev
make
```

## Run

The Node provider spawns `dsh-computer-use-x11-helper` (override with
`DSH_COMPUTER_USE_X11_HELPER`). The helper speaks JSON-lines on stdio:

```text
{"id":1,"method":"listWindows"}
{"id":2,"method":"getWindow","windowId":"x11:xid:0x03400007"}
```

## Status

- Implemented: window enumeration, getWindow, PNG capture, activation, XTest
  mouse/keyboard, scroll, drag.
- TODO: AT-SPI2 accessibility tree, clipboard selection owner, Wayland
  integration (see `../wayland/`).
