{
  "targets": [{
    "target_name": "dsh_computer_use_native",
    "sources": ["src/provider.cc"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
    "defines": ["NAPI_CPP_EXCEPTIONS"],
    "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1 } },
    "conditions": [["OS==\"win\"", {
      "libraries": ["user32.lib", "gdi32.lib", "ole32.lib", "uiautomationcore.lib", "gdiplus.lib"]
    }]]
  }]
}
