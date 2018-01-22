import { Gulpclass, Task, SequenceTask } from "gulpclass";
import * as gulp from "gulp";
import * as del from "del";
import { Parser } from "./src/Parser";

@Gulpclass()
export class Gulpfile {
  @Task()
  clean(cb: Function) {
    return del(["out/**/*"], cb);
  }

  @Task()
  copySourceFiles() {
    return gulp.src(["../src/**.json"]).pipe(gulp.dest(""));
  }

  @Task()
  copyHandlebarsTemplates() {
    return gulp.src(["../src/templates/**.hb"]).pipe(gulp.dest("templates"));
  }

  @SequenceTask()
  default() {
    // because this task has "default" name it will be run as default gulp task
    return ["copySourceFiles", "copyHandlebarsTemplates", "runTest"];
  }

  @Task()
  copyDeclarationsToTestFolder() {
    return gulp.src("./declarations/**/*").
    pipe(gulp.dest("../test/declarations"));
  }

  @Task()
  runTest() {
    let p = new Parser("./src/config.json");
    p.GenerateDeclarations("declarations");
    return gulp.src(["../src/replacements/**/*"]).pipe(gulp.dest("replacements"));
  }
}
