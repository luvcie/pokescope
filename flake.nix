{
  description = "Pokémon Showdown info commands in your terminal";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      # bun install produces platform-specific node_modules, so the FOD output
      # hash differs per system. Add an entry here for each system we've
      # verified.
      nodeDepsHashes = {
        "x86_64-linux" = "sha256-6FKUL9QEshrLTRifp5LxWBq4drnRJYZeZ2qkEsyYtos=";
        "aarch64-darwin" = "sha256-sTpRoCQp67oH7hUgbvhAV/bG7PX+m11Ec6taLAO/zio=";
      };
      systems = builtins.attrNames nodeDepsHashes;
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};

          nodeDeps = pkgs.stdenv.mkDerivation {
            name = "pokescope-node-modules";
            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter = name: type:
                !(type == "directory" && baseNameOf name == "node_modules");
            };
            nativeBuildInputs = [ pkgs.bun ];
            buildPhase = ''
              export HOME=$(mktemp -d)
              export BUN_INSTALL_CACHE_DIR=$(mktemp -d)
              bun install --frozen-lockfile --ignore-scripts
              rm -rf node_modules/.bin
            '';
            installPhase = "cp -r node_modules $out";
            dontFixup = true;
            outputHashAlgo = "sha256";
            outputHashMode = "recursive";
            outputHash = nodeDepsHashes.${system};
          };
        in {
          default = pkgs.stdenv.mkDerivation {
            pname = "pokescope";
            version = "0.1.0";
            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter = name: type:
                !(type == "directory" && baseNameOf name == "node_modules");
            };

            nativeBuildInputs = [ pkgs.makeWrapper ];
            dontBuild = true;

            installPhase = ''
              mkdir -p $out/share/pokescope $out/bin

              cp pokescope.ts tsconfig.json $out/share/pokescope/
              cp -r src $out/share/pokescope/

              mkdir -p $out/share/pokescope/node_modules
              cp -r ${nodeDeps}/. $out/share/pokescope/node_modules/

              makeWrapper ${pkgs.bun}/bin/bun $out/bin/pokescope \
                --add-flags "run $out/share/pokescope/pokescope.ts"
            '';

            meta = with pkgs.lib; {
              description = "Pokémon Showdown info commands in your terminal";
              homepage = "https://github.com/luvcie/pokescope";
              license = licenses.mit;
              maintainers = [ ];
              mainProgram = "pokescope";
              platforms = platforms.linux ++ platforms.darwin;
            };
          };
        }
      );
    };
}
