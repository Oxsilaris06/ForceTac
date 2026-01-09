cmake_minimum_required(VERSION 3.22.1)
project("forcetac_core")

add_library(
    forcetac_core
    SHARED
    forcetac_core.cpp
)

find_library(log-lib log)

target_link_libraries(
    forcetac_core
    ${log-lib}
)
