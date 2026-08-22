{
  "targets": [{
    "target_name": "dsh_computer_use_macos_native",
    "sources": ["src/provider.mm"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
    "defines": ["NAPI_CPP_EXCEPTIONS"],
    "xcode_settings": {
      "MACOSX_DEPLOYMENT_TARGET": "13.0",
      "CLANG_ENABLE_OBJC_ARC": "YES",
      "OTHER_LDFLAGS": [
        "-framework ApplicationServices",
        "-framework CoreGraphics",
        "-framework AppKit",
        "-framework CoreFoundation",
        "-framework Carbon"
      ]
    },
    "conditions": [
      ["target_arch=='arm64'", { "xcode_settings": { "ARCHS": ["arm64"] } }],
      ["target_arch=='x64'",  { "xcode_settings": { "ARCHS": ["x86_64"] } }]
    ]
  }]
}
