# Maintainer: luvcie <lucielove9@proton.me>
pkgname=pokescope
pkgver=0.1.0
pkgrel=1
pkgdesc="Pokémon Showdown info commands in your terminal"
arch=('x86_64' 'aarch64')
url="https://github.com/luvcie/pokescope"
license=('MIT')
makedepends=('bun')
source=("$pkgname-$pkgver.tar.gz::https://github.com/luvcie/$pkgname/archive/v$pkgver.tar.gz")
b2sums=('SKIP')

build() {
    cd "$pkgname-$pkgver"
    bun install --frozen-lockfile
    bun build --compile pokescope.ts --outfile pokescope
}

package() {
    cd "$pkgname-$pkgver"
    install -Dm755 pokescope "$pkgdir/usr/bin/pokescope"
}
