import React from "react";
import { Route, Switch } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useTitleProps } from "src/hooks/title";
import Label from "./LabelDetails/Label";
import LabelCreate from "./LabelDetails/LabelCreate";
import { LabelList } from "./LabelList";
import { View } from "../List/views";

const Labels: React.FC = () => {
  return <LabelList view={View.Labels} />;
};

const LabelRoutes: React.FC = () => {
  const titleProps = useTitleProps({ id: "labels" });
  return (
    <>
      <Helmet {...titleProps} />
      <Switch>
        <Route exact path="/labels" component={Labels} />
        <Route exact path="/labels/new" component={LabelCreate} />
        <Route path="/labels/:id/:tab?" component={Label} />
      </Switch>
    </>
  );
};

export default LabelRoutes;
