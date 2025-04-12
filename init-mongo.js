try {
  const status = rs.status();
  if (status.ok !== 1) {
    rs.initiate({
      _id: "rs0",
      members: [{ _id: 0, host: "mongo" }]
    });
    print("Replica set initiated");
  } else {
    print("Replica set already initiated");
  }
} catch (e) {
  rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: "mongo" }]
  });
  print("Replica set initiated after error");
}