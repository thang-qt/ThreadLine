{
  lib,
  buildGoModule,
}:
buildGoModule {
  pname = "threadline";
  version = "0-unstable";
  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      lib.cleanSourceFilter path type
      && !(builtins.elem (builtins.baseNameOf path) [
        "node_modules"
        ".direnv"
        ".build"
        "threadline"
        ".env"
        ".env.local"
      ]);
  };
  vendorHash = "sha256-iPgr/h5K1aK0GaaRWkRS86ET7Jv0VUXUimj+5YPtGMo=";
  subPackages = ["."];
  tags = ["production"];
  env.CGO_ENABLED = 0;
  ldflags = ["-s" "-w"];
  postConfigure = ''
    go run ./internal/buildassets
  '';
  meta = {
    description = "Compact Hacker News and Lobsters reader";
    homepage = "https://github.com/thang-qt/ThreadLine";
    mainProgram = "threadline";
    platforms = lib.platforms.unix;
  };
}
