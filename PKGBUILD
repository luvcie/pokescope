# Maintainer: luvcie <lucielove9@proton.me>
pkgname=pokescope
pkgver=0.1.0
pkgrel=1
pkgdesc="Pokémon Showdown info commands in your terminal"
arch=('any')
url="https://github.com/luvcie/pokescope"
license=('MIT')
depends=('bun')
makedepends=('bun')
source=("$pkgname-$pkgver.tar.gz::https://github.com/luvcie/$pkgname/archive/v$pkgver.tar.gz")
b2sums=('SKIP')

build() {
    cd "$pkgname-$pkgver"
    bun install --frozen-lockfile --ignore-scripts
    rm -rf node_modules/.bin
}

package() {
    cd "$pkgname-$pkgver"

    install -dm755 "$pkgdir/usr/share/pokescope"
    cp -r pokescope.ts tsconfig.json src node_modules "$pkgdir/usr/share/pokescope/"

    install -dm755 "$pkgdir/usr/bin"
    cat > "$pkgdir/usr/bin/pokescope" <<'EOF'
#!/bin/sh
exec bun run /usr/share/pokescope/pokescope.ts "$@"
EOF
    chmod 755 "$pkgdir/usr/bin/pokescope"

    install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}
