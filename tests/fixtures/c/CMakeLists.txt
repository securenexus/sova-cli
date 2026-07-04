cmake_minimum_required(VERSION 3.20)
project(MyProject VERSION 1.0.0)

find_package(Boost 1.83 REQUIRED COMPONENTS filesystem system)
find_package(OpenSSL 3.0 REQUIRED)
find_package(ZLIB REQUIRED)

include(FetchContent)
FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG v1.14.0
)
FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.2
)
FetchContent_MakeAvailable(googletest nlohmann_json)

add_executable(myproject main.cpp)
target_link_libraries(myproject Boost::filesystem OpenSSL::SSL)
