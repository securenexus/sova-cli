const SCOPED_NPM_RE = /^(@[^/]+)\/(.+)$/;

function encodeNpmName(name: string): string {
  const m = name.match(SCOPED_NPM_RE);
  if (m) return `${encodeURIComponent(m[1])}/${m[2]}`;
  return name;
}

export function buildPurl(
  packageManager: string,
  name: string,
  version: string,
): string | undefined {
  if (!name || !version) return undefined;
  switch (packageManager) {
    case 'npm':
    case 'yarn':
    case 'pnpm':
    case 'bun':
      return `pkg:npm/${encodeNpmName(name)}@${version}`;
    case 'pypi':
    case 'pip':
    case 'poetry':
      return `pkg:pypi/${name.toLowerCase()}@${version}`;
    case 'gem':
    case 'rubygems':
      return `pkg:gem/${name}@${version}`;
    case 'cargo':
      return `pkg:cargo/${name}@${version}`;
    case 'maven': {
      const [groupId, artifactId] = name.split(':');
      if (groupId && artifactId) return `pkg:maven/${groupId}/${artifactId}@${version}`;
      return `pkg:maven/${name}@${version}`;
    }
    case 'gradle': {
      const [g, a] = name.split(':');
      if (g && a) return `pkg:maven/${g}/${a}@${version}`;
      return undefined;
    }
    case 'go':
      return `pkg:golang/${name}@${version}`;
    case 'nuget':
      return `pkg:nuget/${name}@${version}`;
    case 'pub':
      return `pkg:pub/${name}@${version}`;
    case 'hex':
      return `pkg:hex/${name}@${version}`;
    case 'composer':
      return `pkg:composer/${name}@${version}`;
    case 'cocoapods':
      return `pkg:cocoapods/${name}@${version}`;
    case 'swift':
      return `pkg:swift/${name}@${version}`;
    case 'cpan':
      return `pkg:cpan/${name}@${version}`;
    case 'cran':
      return `pkg:cran/${name}@${version}`;
    case 'opam':
      return `pkg:opam/${name}@${version}`;
    case 'hackage':
      return `pkg:hackage/${name}@${version}`;
    case 'haxelib':
      return `pkg:haxelib/${name}@${version}`;
    case 'bower':
      return `pkg:bower/${name}@${version}`;
    case 'docker':
      return `pkg:docker/${name}@${version}`;
    case 'github':
    case 'github_actions':
      return `pkg:github/${name}@${version}`;
    case 'terraform':
    case 'html':
    case 'conan':
    case 'vcpkg':
    case 'rebar':
    case 'sbt':
    case 'julia':
      return undefined;
    default:
      return undefined;
  }
}
