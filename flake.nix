{
  description = "Pokémon Showdown info commands in your terminal";

  inputs = {
    # SPIKE: pointing at Eveeifyeve/nixpkgs branch `bun-hooks` to test PR #376299
    # (bun.fetchDeps + bun.configHook). Latest commit on the branch as of 2026-05-14.
    nixpkgs.url = "github:Eveeifyeve/nixpkgs/77139725dce1a5eb6a364d54aa12d7cb8524dced";
    systems.url = "github:nix-systems/default";
  };

  outputs = inputs:
    let
      eachSystem = inputs.nixpkgs.lib.genAttrs (import inputs.systems);
      pkgsFor = eachSystem (system: import inputs.nixpkgs { inherit system; });
    in {
      packages = eachSystem (system:
        let pkgs = pkgsFor.${system}; in {
          default = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "pokescope";
            version = "0.1.0";

            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter = name: type:
                !(type == "directory" && baseNameOf name == "node_modules");
            };

            bunDeps = pkgs.bun.fetchDeps {
              inherit (finalAttrs) pname version src;
              installFlags = [ "--omit=dev" ];
              outputHash = "sha256-7r0CTrUO+bKgzXgYij1Gq+9ycbCsoQJzPQKz1R1wMvw=";
              outputHashAlgo = "sha256";
            };

            bunInstallFlags = [ "--linker=isolated" "--omit=dev" ];

            nativeBuildInputs = [
              pkgs.bun
              pkgs.makeWrapper
            ];

            dontBuild = true;

            # WORKAROUND for PR #376299 bug: configHook script expects tarball to
            # unpack into a named subdirectory but fetchDeps tars contents at root.
            # Inline equivalent logic here instead of `nativeBuildInputs = [ bun.configHook ];`
            configurePhase = ''
              runHook preConfigure

              export HOME=$(mktemp -d)
              export BUN_INSTALL_CACHE_DIR=$(mktemp -d)

              tar -xzf $bunDeps -C $BUN_INSTALL_CACHE_DIR
              chmod -R +w $BUN_INSTALL_CACHE_DIR

              bun install \
                --registry=http://localhost \
                --ignore-scripts \
                --linker=isolated --omit=dev \
                --frozen-lockfile

              patchShebangs node_modules/{*,.*}

              runHook postConfigure
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p $out/share/pokescope $out/bin

              cp pokescope.ts tsconfig.json $out/share/pokescope/
              cp -r src $out/share/pokescope/
              cp -r node_modules $out/share/pokescope/

              makeWrapper ${pkgs.bun}/bin/bun $out/bin/pokescope \
                --add-flags "run $out/share/pokescope/pokescope.ts"

              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = "Pokémon Showdown info commands in your terminal";
              homepage = "https://github.com/luvcie/pokescope";
              license = licenses.mit;
              maintainers = [ ];
              mainProgram = "pokescope";
              platforms = platforms.linux ++ platforms.darwin;
            };
          });
        });

      devShells = eachSystem (system:
        let pkgs = pkgsFor.${system}; in {
          default = pkgs.mkShell {
            packages = with pkgs; [ bun ];
          };
        });
    };
}
