{
  "targets": [
    {
      "target_name": "topluyo_capture",
      "sources": [
        "src/addon.cpp",
        "src/wasapi_capture.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "_WIN32_WINNT=0x0A00",
        "NTDDI_VERSION=0x0A00000A"
      ],
      "conditions": [
        ['OS=="win"', {
          "libraries": [
            "-lMmdevapi.lib",
            "-lAvrt.lib"
          ]
        }]
      ]
    }
  ]
}
