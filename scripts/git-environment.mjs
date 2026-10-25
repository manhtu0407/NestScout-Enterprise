// Hooks export repository selectors that override a subprocess's working directory.
export function gitEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !/^GIT_/i.test(name)));
}
