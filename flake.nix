{
  description = "Pokémon Showdown info commands in your terminal";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};

          # Pre-fetch npm deps in a fixed-output derivation so the main build
          # can run offline inside the Nix sandbox.
          # To compute the hash: set outputHash = "" and run `nix build`, then
          # copy the sha256 from the error message.
          nodeDeps = pkgs.stdenv.mkDerivation {
            name = "pokescope-node-modules";
            src = ./.;
            nativeBuildInputs = [ pkgs.bun ];
            buildPhase = ''
              export HOME=$(mktemp -d)
              export BUN_INSTALL_CACHE_DIR=$(mktemp -d)
              bun install --frozen-lockfile
            '';
            installPhase = "cp -r node_modules $out";
            outputHashAlgo = "sha256";
            outputHashMode = "recursive";
            outputHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
          };
        in {
          default = pkgs.stdenv.mkDerivation {
            pname = "pokescope";
            version = "0.1.0";
            src = ./.;

            nativeBuildInputs = [ pkgs.bun ];

            buildPhase = ''
              ln -s ${nodeDeps} node_modules
              bun build --compile pokescope.ts --outfile pokescope
            '';

            installPhase = ''
              install -Dm755 pokescope $out/bin/pokescope
            '';

            meta = with pkgs.lib; {
              description = "Pokémon Showdown info commands in your terminal";
              homepage = "https://github.com/luvcie/pokescope";
              license = licenses.mit;
              maintainers = [ ];
              mainProgram = "pokescope";
              platforms = platforms.linux;
            };
          };
        }
      );
    };
}
