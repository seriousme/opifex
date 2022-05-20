type Sub = {
  as: string;
  bs?: string;
  cs?: string;
};

type Main = {
  a: string;
  b: string;
  c?: string;
  opts?: Omit<
    Sub,
    "cs"
  >;
};

function test(params: Main = {
  a: "a",
  b: "b",
  opts:{
    as:"as"
  }
}) {}
