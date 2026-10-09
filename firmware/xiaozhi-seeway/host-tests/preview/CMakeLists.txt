cmake_minimum_required(VERSION 3.16)
project(seeway_preview LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(LV_BUILD_CONF_PATH "${CMAKE_CURRENT_SOURCE_DIR}/lv_conf.h" CACHE PATH "" FORCE)
set(CONFIG_LV_BUILD_DEMOS OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_USE_THORVG_INTERNAL OFF CACHE BOOL "" FORCE)
if(NOT LVGL_SOURCE)
  message(FATAL_ERROR "Set LVGL_SOURCE to the pinned prepared source's LVGL component")
endif()
add_subdirectory("${LVGL_SOURCE}" lvgl)
set(SEEWAY "${CMAKE_CURRENT_SOURCE_DIR}/../../overlay/main/seeway")
add_executable(seeway-preview
  preview.cpp
  "${SEEWAY}/seeway_display.cc"
  "${SEEWAY}/seeway_screen_state.cc"
  "${SEEWAY}/seeway_character.cc"
  "${SEEWAY}/seeway_font_14.c")
target_include_directories(seeway-preview PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/stubs" "${SEEWAY}")
target_link_libraries(seeway-preview PRIVATE lvgl)
