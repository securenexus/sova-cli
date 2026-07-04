name := "my-scala-project"
version := "1.0.0"
scalaVersion := "2.13.12"

licenses := Seq("Apache-2.0")

libraryDependencies ++= Seq(
  "com.typesafe.akka" %% "akka-actor" % "2.8.5",
  "com.typesafe.akka" %% "akka-stream" % "2.8.5",
  "org.scalatest" %% "scalatest" % "3.2.17" % Test,
  "io.circe" %% "circe-core" % "0.14.6",
  "io.circe" %% "circe-generic" % "0.14.6"
)

libraryDependencies += "com.typesafe.play" %% "play-json" % "2.10.4"
