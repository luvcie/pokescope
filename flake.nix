{
  description = "Pokémon Showdown info commands in your terminal";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";

    bun2nix.url = "github:nix-community/bun2nix?ref=2.1.0";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    bun2nix.inputs.systems.follows = "systems";
  };

  nixConfig = {
    extra-substituters = [ "https://nix-community.cachix.org" ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  outputs = inputs:
    let
      eachSystem = inputs.nixpkgs.lib.genAttrs (import inputs.systems);
      pkgsFor = eachSystem (system:
        import inputs.nixpkgs {
          inherit system;
          overlays = [ inputs.bun2nix.overlays.default ];
        });
    in {
      packages = eachSystem (system:
        let pkgs = pkgsFor.${system}; in {
          default = pkgs.bun2nix.mkDerivation {
            packageJson = ./package.json;

            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter = name: type:
                !(type == "directory" && baseNameOf name == "node_modules");
            };

            bunDeps = pkgs.bun2nix.fetchBunDeps {
              bunNix = ./bun.nix;
            };

            nativeBuildInputs = [ pkgs.makeWrapper ];

            dontUseBunBuild = true;
            bunInstallFlags = [ "--linker=isolated" "--omit=dev" ];

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
          };
        });

      devShells = eachSystem (system:
        let pkgs = pkgsFor.${system}; in {
          # bun2nix is in package.json devDependencies, so `bunx bun2nix -o bun.nix`
          # works after `bun install` without needing the Rust build here.
          default = pkgs.mkShell {
            packages = with pkgs; [ bun ];
          };
        });
    };
}
