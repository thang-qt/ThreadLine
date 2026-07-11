{
  description = "Threadline static reader development shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    in {
      devShells = builtins.listToAttrs (map (system: {
        name = system;
        value.default = let pkgs = import nixpkgs { inherit system; }; in pkgs.mkShell {
          packages = [ pkgs.nodejs_22 pkgs.pnpm ];
        };
      }) systems);
    };
}
